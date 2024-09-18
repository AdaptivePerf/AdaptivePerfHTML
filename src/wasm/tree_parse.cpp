#include "tree_parse.hpp"
#include <vector>
#include <string>
#include <unordered_map>

TreeNode* prune_tree(const TreeNode *node, uint64_t threshold_left,
                     uint64_t threshold_right, const std::string counter_name) {
  TreeNode* pruned_node = new TreeNode(*node);

  pruned_node->children.clear();

  // if leaf node remove samples outside time interval and subtract from total value
  if (node->children.empty()) {
    uint64_t extra_value = 0;

    for (auto it = pruned_node->samples.begin(); it != pruned_node->samples.end();) {
      // if walltime, make a more refined guess of the zoomed-in walltime
      // of the current node
      if (counter_name == "walltime") {
        if (it->timestamp - it->value < threshold_left &&
            it->timestamp >= threshold_left) {
          extra_value += threshold_left - (it->timestamp - it->value);
          ++it;
        } else if (it->timestamp - it->value < threshold_right &&
                   it->timestamp >= threshold_right) {
          extra_value += it->timestamp - threshold_right;
          ++it;
        } else if (it->timestamp < threshold_left ||
                   it->timestamp > threshold_right) {
          extra_value += it->value;
          it = pruned_node->samples.erase(it);
        } else {
          ++it;
        }
      } else { // for other types of counters, just substract the period
        if (it->timestamp < threshold_left || it->timestamp > threshold_right) {
          extra_value += it->value;
          it = pruned_node->samples.erase(it);
        } else {
          ++it;
        }
      }
    }
    pruned_node->value -= extra_value;
    if (pruned_node->value == 0) {
      return {}; // no value, means it would not be displayed
    }
  } else {
    pruned_node->value = 0;

    for (const auto &child : node->children) {
      TreeNode* pruned_child = prune_tree(child, threshold_left, threshold_right,
                                          counter_name);

      // add the child if after extra counters (outside timeinterval)
      // where substracted, final value > 0
      if (pruned_child->value > 0) {
        pruned_node->children.push_back(pruned_child);
        // new value of parent is sum of children values
        pruned_node->value += pruned_child->value;
      }
    }

    if (pruned_node->value == 0 && pruned_node->children.empty()) {
      return {};
    }
  }

  return pruned_node;
}

void merge_nodes(TreeNode &target, const TreeNode &source) {
  target.value += source.value;
  target.samples.clear();
  target.children.insert(target.children.end(), source.children.begin(),
                         source.children.end());
}

void merge_tree(TreeNode &root) {
  std::unordered_map<std::string, TreeNode *> merged_children;

  for (auto it = root.children.begin(); it != root.children.end(); ) {
    if (merged_children.find((*it)->name) != merged_children.end()) {
      merge_nodes(*merged_children[(*it)->name], *(*it));
      it = root.children.erase(it);
    } else {
      merged_children[(*it)->name] = *it;
      ++it;
    }
  }
  for (auto &child : root.children) {
    merge_tree(*child);
  }
}

TreeNode* slice_flame_graph(const TreeNode *node, uint64_t threshold_left,
                            uint64_t threshold_right,
                            const std::string counter_name, bool time_ordered) {

  TreeNode* pruned_tree = prune_tree(node, threshold_left,
                                     threshold_right, counter_name);

  if(!time_ordered){
    merge_tree(*pruned_tree);
  }
  return pruned_tree;
}

void delete_tree(TreeNode *node) {
  if (node) {
    for (auto child : node->children) {
      delete_tree(child);
    }
    delete node;
  }
}
